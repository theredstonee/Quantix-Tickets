package com.quantix.tickets.ui.viewmodel

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quantix.tickets.data.model.Server
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.data.repository.ServerRepository
import kotlinx.coroutines.launch

class ServerListViewModel : ViewModel() {

    private val serverRepository = ServerRepository()

    private val _serversState = MutableLiveData<Resource<List<Server>>>()
    val serversState: LiveData<Resource<List<Server>>> = _serversState

    private val _selectedServer = MutableLiveData<Server?>()
    val selectedServer: LiveData<Server?> = _selectedServer

    init {
        loadServers()
    }

    fun loadServers() {
        viewModelScope.launch {
            _serversState.value = Resource.loading()
            val result = serverRepository.getServers()
            _serversState.value = result
        }
    }

    fun selectServer(server: Server) {
        _selectedServer.value = server
    }

    fun refreshServers() {
        loadServers()
    }
}
