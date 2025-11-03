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
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.quantix.tickets.R
import com.quantix.tickets.data.model.TicketDetail
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.ui.adapter.MessageAdapter
import com.quantix.tickets.ui.viewmodel.TicketDetailViewModel
import java.text.SimpleDateFormat
import java.util.*

class TicketDetailFragment : Fragment() {

    private val viewModel: TicketDetailViewModel by viewModels()
    private lateinit var messageAdapter: MessageAdapter

    private lateinit var toolbar: MaterialToolbar
    private lateinit var ticketTitle: TextView
    private lateinit var ticketTopic: TextView
    private lateinit var ticketStatus: TextView
    private lateinit var ticketPriority: TextView
    private lateinit var ticketCreator: TextView
    private lateinit var ticketDate: TextView
    private lateinit var messagesRecyclerView: RecyclerView
    private lateinit var messageInput: TextInputEditText
    private lateinit var sendButton: MaterialButton
    private lateinit var loadingProgress: ProgressBar

    private var guildId: String? = null
    private var ticketId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        guildId = arguments?.getString("guildId")
        ticketId = arguments?.getString("ticketId")
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_ticket_detail, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        toolbar = view.findViewById(R.id.toolbar)
        ticketTitle = view.findViewById(R.id.ticketTitle)
        ticketTopic = view.findViewById(R.id.ticketTopic)
        ticketStatus = view.findViewById(R.id.ticketStatus)
        ticketPriority = view.findViewById(R.id.ticketPriority)
        ticketCreator = view.findViewById(R.id.ticketCreator)
        ticketDate = view.findViewById(R.id.ticketDate)
        messagesRecyclerView = view.findViewById(R.id.messagesRecyclerView)
        messageInput = view.findViewById(R.id.messageInput)
        sendButton = view.findViewById(R.id.sendButton)
        loadingProgress = view.findViewById(R.id.loadingProgress)

        setupToolbar()
        setupRecyclerView()
        setupMessageInput()
        observeViewModel()

        if (guildId != null && ticketId != null) {
            viewModel.loadTicketDetail(guildId!!, ticketId!!)
        }
    }

    private fun setupToolbar() {
        toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun setupRecyclerView() {
        messageAdapter = MessageAdapter()

        messagesRecyclerView.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = messageAdapter
        }
    }

    private fun setupMessageInput() {
        sendButton.setOnClickListener {
            val content = messageInput.text?.toString()?.trim()
            if (!content.isNullOrEmpty()) {
                viewModel.sendMessage(content)
                messageInput.text?.clear()
            }
        }
    }

    private fun observeViewModel() {
        viewModel.ticketState.observe(viewLifecycleOwner) { resource ->
            when (resource) {
                is Resource.Loading -> {
                    loadingProgress.visibility = View.VISIBLE
                }
                is Resource.Success -> {
                    loadingProgress.visibility = View.GONE

                    resource.data?.let { detail ->
                        updateTicketInfo(detail)
                        messageAdapter.submitList(detail.messages)
                        messagesRecyclerView.scrollToPosition(detail.messages.size - 1)
                    }
                }
                is Resource.Error -> {
                    loadingProgress.visibility = View.GONE

                    view?.let {
                        Snackbar.make(it, resource.message ?: "Fehler beim Laden des Tickets", Snackbar.LENGTH_LONG)
                            .setAction("Erneut versuchen") {
                                viewModel.refreshTicket()
                            }
                            .show()
                    }
                }
            }
        }

        viewModel.messageState.observe(viewLifecycleOwner) { resource ->
            when (resource) {
                is Resource.Loading -> {
                    sendButton.isEnabled = false
                }
                is Resource.Success -> {
                    sendButton.isEnabled = true
                    viewModel.resetMessageState()
                }
                is Resource.Error -> {
                    sendButton.isEnabled = true
                    view?.let {
                        Snackbar.make(it, resource.message ?: "Fehler beim Senden der Nachricht", Snackbar.LENGTH_SHORT).show()
                    }
                    viewModel.resetMessageState()
                }
            }
        }

        viewModel.closeState.observe(viewLifecycleOwner) { resource ->
            when (resource) {
                is Resource.Success -> {
                    view?.let {
                        Snackbar.make(it, "Ticket erfolgreich geschlossen", Snackbar.LENGTH_SHORT).show()
                    }
                    findNavController().navigateUp()
                }
                is Resource.Error -> {
                    view?.let {
                        Snackbar.make(it, resource.message ?: "Fehler beim Schließen", Snackbar.LENGTH_SHORT).show()
                    }
                }
                else -> {}
            }
        }
    }

    private fun updateTicketInfo(detail: TicketDetail) {
        val ticket = detail.ticket

        ticketTitle.text = "Ticket #${ticket.ticketId}"
        ticketTopic.text = ticket.topic
        ticketStatus.text = "${ticket.statusEmoji} ${if (ticket.isOpen) "Offen" else "Geschlossen"}"

        val priorityText = when (ticket.priority) {
            0 -> "🟢 Niedrig"
            1 -> "🟠 Mittel"
            2 -> "🔴 Hoch"
            else -> "⚪ Unbekannt"
        }
        ticketPriority.text = priorityText

        ticketCreator.text = "Von: ${ticket.creator?.username ?: "Unbekannt"}"

        val dateFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMAN)
        val date = Date(ticket.createdAt)
        ticketDate.text = "Erstellt: ${dateFormat.format(date)}"
    }
}
