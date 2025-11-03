package com.quantix.tickets.ui.viewmodel

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quantix.tickets.data.model.FormResponse
import com.quantix.tickets.data.model.Message
import com.quantix.tickets.data.model.Ticket
import com.quantix.tickets.data.model.TicketDetail
import com.quantix.tickets.data.model.TicketPermissions
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.data.repository.TicketRepository
import kotlinx.coroutines.launch

class TicketDetailViewModel : ViewModel() {

    private val ticketRepository = TicketRepository()

    private val _ticketState = MutableLiveData<Resource<TicketDetail>>()
    val ticketState: LiveData<Resource<TicketDetail>> = _ticketState

    private val _messageState = MutableLiveData<Resource<Message>>()
    val messageState: LiveData<Resource<Message>> = _messageState

    private val _closeState = MutableLiveData<Resource<String>>()
    val closeState: LiveData<Resource<String>> = _closeState

    private var currentGuildId: String? = null
    private var currentTicketId: String? = null

    fun loadTicketDetail(guildId: String, ticketId: String) {
        currentGuildId = guildId
        currentTicketId = ticketId

        viewModelScope.launch {
            _ticketState.value = Resource.loading()
            val result = ticketRepository.getTicketDetail(guildId, ticketId)
            _ticketState.value = result
        }
    }

    fun sendMessage(content: String) {
        val guildId = currentGuildId ?: return
        val ticketId = currentTicketId ?: return

        viewModelScope.launch {
            _messageState.value = Resource.loading()
            val result = ticketRepository.sendMessage(guildId, ticketId, content)
            _messageState.value = result

            if (result is Resource.Success) {
                refreshTicket()
            }
        }
    }

    fun closeTicket() {
        val guildId = currentGuildId ?: return
        val ticketId = currentTicketId ?: return

        viewModelScope.launch {
            _closeState.value = Resource.loading()
            val result = ticketRepository.closeTicket(guildId, ticketId)
            _closeState.value = result
        }
    }

    fun refreshTicket() {
        val guildId = currentGuildId ?: return
        val ticketId = currentTicketId ?: return
        loadTicketDetail(guildId, ticketId)
    }

    fun resetMessageState() {
        _messageState.value = null
    }

    fun resetCloseState() {
        _closeState.value = null
    }
}
