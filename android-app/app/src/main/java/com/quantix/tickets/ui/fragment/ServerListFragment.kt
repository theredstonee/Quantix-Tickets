package com.quantix.tickets.ui.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.snackbar.Snackbar
import com.quantix.tickets.R
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.ui.adapter.ServerAdapter
import com.quantix.tickets.ui.viewmodel.ServerListViewModel

class ServerListFragment : Fragment() {

    private val viewModel: ServerListViewModel by viewModels()
    private lateinit var serverAdapter: ServerAdapter

    private lateinit var recyclerView: RecyclerView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var loadingProgress: ProgressBar
    private lateinit var emptyStateText: TextView

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_server_list, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        recyclerView = view.findViewById(R.id.serversRecyclerView)
        swipeRefresh = view.findViewById(R.id.swipeRefresh)
        loadingProgress = view.findViewById(R.id.loadingProgress)
        emptyStateText = view.findViewById(R.id.emptyStateText)

        setupRecyclerView()
        setupSwipeRefresh()
        observeViewModel()
    }

    private fun setupRecyclerView() {
        serverAdapter = ServerAdapter { server ->
            viewModel.selectServer(server)

            val bundle = Bundle().apply {
                putString("guildId", server.id)
                putString("guildName", server.name)
            }
            findNavController().navigate(R.id.action_serverList_to_ticketList, bundle)
        }

        recyclerView.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = serverAdapter
        }
    }

    private fun setupSwipeRefresh() {
        swipeRefresh.setOnRefreshListener {
            viewModel.refreshServers()
        }
    }

    private fun observeViewModel() {
        viewModel.serversState.observe(viewLifecycleOwner) { resource ->
            when (resource) {
                is Resource.Loading -> {
                    loadingProgress.visibility = View.VISIBLE
                    recyclerView.visibility = View.GONE
                    emptyStateText.visibility = View.GONE
                }
                is Resource.Success -> {
                    loadingProgress.visibility = View.GONE
                    swipeRefresh.isRefreshing = false

                    val servers = resource.data ?: emptyList()
                    if (servers.isEmpty()) {
                        emptyStateText.visibility = View.VISIBLE
                        recyclerView.visibility = View.GONE
                    } else {
                        emptyStateText.visibility = View.GONE
                        recyclerView.visibility = View.VISIBLE
                        serverAdapter.submitList(servers)
                    }
                }
                is Resource.Error -> {
                    loadingProgress.visibility = View.GONE
                    swipeRefresh.isRefreshing = false

                    view?.let {
                        Snackbar.make(it, resource.message ?: "Fehler beim Laden der Server", Snackbar.LENGTH_LONG)
                            .setAction("Erneut versuchen") {
                                viewModel.refreshServers()
                            }
                            .show()
                    }
                }
            }
        }
    }
}
