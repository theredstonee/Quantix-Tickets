package com.quantix.tickets.ui.viewmodel

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quantix.tickets.data.model.Ticket
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.data.repository.TicketRepository
import kotlinx.coroutines.launch

class TicketListViewModel : ViewModel() {

    private val ticketRepository = TicketRepository()

    private val _ticketsState = MutableLiveData<Resource<List<Ticket>>>()
    val ticketsState: LiveData<Resource<List<Ticket>>> = _ticketsState

    private val _filterStatus = MutableLiveData<TicketFilterStatus>(TicketFilterStatus.ALL)
    val filterStatus: LiveData<TicketFilterStatus> = _filterStatus

    private val _filteredTickets = MutableLiveData<List<Ticket>>()
    val filteredTickets: LiveData<List<Ticket>> = _filteredTickets

    private var currentGuildId: String? = null
    private var allTickets: List<Ticket> = emptyList()

    fun loadTickets(guildId: String) {
        currentGuildId = guildId
        viewModelScope.launch {
            _ticketsState.value = Resource.loading()
            val result = ticketRepository.getTickets(guildId)
            _ticketsState.value = result

            if (result is Resource.Success && result.data != null) {
                allTickets = result.data
                applyFilter()
            }
        }
    }

    fun setFilter(status: TicketFilterStatus) {
        _filterStatus.value = status
        applyFilter()
    }

    private fun applyFilter() {
        val filtered = when (_filterStatus.value) {
            TicketFilterStatus.OPEN -> allTickets.filter { it.isOpen }
            TicketFilterStatus.CLOSED -> allTickets.filter { it.isClosed }
            TicketFilterStatus.MY_TICKETS -> {
                val userId = com.quantix.tickets.data.api.RetrofitClient.getUserId()
                allTickets.filter { it.creator?.id == userId }
            }
            else -> allTickets
        }
        _filteredTickets.value = filtered
    }

    fun refreshTickets() {
        currentGuildId?.let { loadTickets(it) }
    }

    fun getOpenTicketCount(): Int {
        return allTickets.count { it.isOpen }
    }

    fun getClosedTicketCount(): Int {
        return allTickets.count { it.isClosed }
    }

    fun getTotalTicketCount(): Int {
        return allTickets.size
    }
}

enum class TicketFilterStatus {
    ALL,
    OPEN,
    CLOSED,
    MY_TICKETS
}
