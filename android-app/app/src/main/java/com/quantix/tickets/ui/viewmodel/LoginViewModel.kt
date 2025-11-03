package com.quantix.tickets.ui.viewmodel

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quantix.tickets.data.model.User
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.data.repository.UserRepository
import kotlinx.coroutines.launch

class LoginViewModel : ViewModel() {

    private val userRepository = UserRepository()

    private val _userState = MutableLiveData<Resource<User>>()
    val userState: LiveData<Resource<User>> = _userState

    private val _loginUrl = MutableLiveData<String>()
    val loginUrl: LiveData<String> = _loginUrl

    fun checkLoginStatus() {
        viewModelScope.launch {
            _userState.value = Resource.loading()
            val result = userRepository.getCurrentUser()
            _userState.value = result
        }
    }

    fun initiateLogin(baseUrl: String) {
        val oauthUrl = "$baseUrl/auth/discord"
        _loginUrl.value = oauthUrl
    }

    fun onOAuthCallback(code: String) {
        viewModelScope.launch {
            _userState.value = Resource.loading()
            val result = userRepository.getCurrentUser()
            _userState.value = result
        }
    }

    fun isLoggedIn(): Boolean {
        return userRepository.isLoggedIn()
    }
}
