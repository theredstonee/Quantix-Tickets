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
import com.google.android.material.chip.Chip
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.android.material.snackbar.Snackbar
import com.quantix.tickets.R
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.ui.adapter.TicketAdapter
import com.quantix.tickets.ui.viewmodel.TicketFilterStatus
import com.quantix.tickets.ui.viewmodel.TicketListViewModel

class TicketListFragment : Fragment() {

    private val viewModel: TicketListViewModel by viewModels()
    private lateinit var ticketAdapter: TicketAdapter

    private lateinit var recyclerView: RecyclerView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var loadingProgress: ProgressBar
    private lateinit var emptyStateText: TextView
    private lateinit var fabCreateTicket: FloatingActionButton

    private lateinit var chipAll: Chip
    private lateinit var chipOpen: Chip
    private lateinit var chipClosed: Chip
    private lateinit var chipMyTickets: Chip

    private var guildId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        guildId = arguments?.getString("guildId")
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_ticket_list, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        recyclerView = view.findViewById(R.id.ticketsRecyclerView)
        swipeRefresh = view.findViewById(R.id.swipeRefresh)
        loadingProgress = view.findViewById(R.id.loadingProgress)
        emptyStateText = view.findViewById(R.id.emptyStateText)
        fabCreateTicket = view.findViewById(R.id.fabCreateTicket)

        chipAll = view.findViewById(R.id.chipAll)
        chipOpen = view.findViewById(R.id.chipOpen)
        chipClosed = view.findViewById(R.id.chipClosed)
        chipMyTickets = view.findViewById(R.id.chipMyTickets)

        setupRecyclerView()
        setupSwipeRefresh()
        setupFilterChips()
        setupFab()
        observeViewModel()

        guildId?.let { viewModel.loadTickets(it) }
    }

    private fun setupRecyclerView() {
        ticketAdapter = TicketAdapter { ticket ->
            val bundle = Bundle().apply {
                putString("guildId", guildId)
                putString("ticketId", ticket.id)
            }
            findNavController().navigate(R.id.action_ticketList_to_ticketDetail, bundle)
        }

        recyclerView.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = ticketAdapter
        }
    }

    private fun setupSwipeRefresh() {
        swipeRefresh.setOnRefreshListener {
            viewModel.refreshTickets()
        }
    }

    private fun setupFilterChips() {
        chipAll.setOnClickListener { viewModel.setFilter(TicketFilterStatus.ALL) }
        chipOpen.setOnClickListener { viewModel.setFilter(TicketFilterStatus.OPEN) }
        chipClosed.setOnClickListener { viewModel.setFilter(TicketFilterStatus.CLOSED) }
        chipMyTickets.setOnClickListener { viewModel.setFilter(TicketFilterStatus.MY_TICKETS) }
    }

    private fun setupFab() {
        fabCreateTicket.setOnClickListener {
            val bundle = Bundle().apply {
                putString("guildId", guildId)
            }
            findNavController().navigate(R.id.action_ticketList_to_createTicket, bundle)
        }
    }

    private fun observeViewModel() {
        viewModel.ticketsState.observe(viewLifecycleOwner) { resource ->
            when (resource) {
                is Resource.Loading -> {
                    loadingProgress.visibility = View.VISIBLE
                    recyclerView.visibility = View.GONE
                    emptyStateText.visibility = View.GONE
                }
                is Resource.Success -> {
                    loadingProgress.visibility = View.GONE
                    swipeRefresh.isRefreshing = false
                }
                is Resource.Error -> {
                    loadingProgress.visibility = View.GONE
                    swipeRefresh.isRefreshing = false

                    view?.let {
                        Snackbar.make(it, resource.message ?: "Fehler beim Laden der Tickets", Snackbar.LENGTH_LONG)
                            .setAction("Erneut versuchen") {
                                viewModel.refreshTickets()
                            }
                            .show()
                    }
                }
            }
        }

        viewModel.filteredTickets.observe(viewLifecycleOwner) { tickets ->
            if (tickets.isEmpty()) {
                emptyStateText.visibility = View.VISIBLE
                recyclerView.visibility = View.GONE
            } else {
                emptyStateText.visibility = View.GONE
                recyclerView.visibility = View.VISIBLE
                ticketAdapter.submitList(tickets)
            }
        }
    }
}
