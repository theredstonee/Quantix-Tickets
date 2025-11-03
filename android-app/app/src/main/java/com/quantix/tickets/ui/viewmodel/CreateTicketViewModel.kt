package com.quantix.tickets.ui.viewmodel

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quantix.tickets.data.model.FormField
import com.quantix.tickets.data.model.Ticket
import com.quantix.tickets.data.model.Topic
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.data.repository.TicketRepository
import kotlinx.coroutines.launch

class CreateTicketViewModel : ViewModel() {

    private val ticketRepository = TicketRepository()

    private val _topicsState = MutableLiveData<Resource<List<Topic>>>()
    val topicsState: LiveData<Resource<List<Topic>>> = _topicsState

    private val _selectedTopic = MutableLiveData<Topic?>()
    val selectedTopic: LiveData<Topic?> = _selectedTopic

    private val _formResponses = MutableLiveData<MutableMap<String, String>>(mutableMapOf())
    val formResponses: LiveData<MutableMap<String, String>> = _formResponses

    private val _createState = MutableLiveData<Resource<Ticket>>()
    val createState: LiveData<Resource<Ticket>> = _createState

    private val _validationErrors = MutableLiveData<Map<String, String>>(emptyMap())
    val validationErrors: LiveData<Map<String, String>> = _validationErrors

    private var currentGuildId: String? = null

    fun loadTopics(guildId: String) {
        currentGuildId = guildId
        viewModelScope.launch {
            _topicsState.value = Resource.loading()
            val result = ticketRepository.getTopics(guildId)
            _topicsState.value = result
        }
    }

    fun selectTopic(topic: Topic) {
        _selectedTopic.value = topic
        _formResponses.value = mutableMapOf()
        _validationErrors.value = emptyMap()
    }

    fun updateFormResponse(fieldLabel: String, value: String) {
        val currentMap = _formResponses.value ?: mutableMapOf()
        currentMap[fieldLabel] = value
        _formResponses.value = currentMap
    }

    fun validateAndCreateTicket() {
        val topic = _selectedTopic.value
        val guildId = currentGuildId

        if (topic == null || guildId == null) {
            return
        }

        val errors = validateFormFields(topic.formFields)
        if (errors.isNotEmpty()) {
            _validationErrors.value = errors
            return
        }

        viewModelScope.launch {
            _createState.value = Resource.loading()
            val responses = _formResponses.value ?: emptyMap()
            val result = ticketRepository.createTicket(guildId, topic.id, responses)
            _createState.value = result
        }
    }

    private fun validateFormFields(fields: List<FormField>): Map<String, String> {
        val errors = mutableMapOf<String, String>()
        val responses = _formResponses.value ?: emptyMap()

        fields.forEach { field ->
            val value = responses[field.label]?.trim() ?: ""

            if (field.required && value.isEmpty()) {
                errors[field.label] = "Dieses Feld ist erforderlich"
                return@forEach
            }

            if (value.isNotEmpty()) {
                if (field.isNumberOnly) {
                    val numberPattern = Regex("""^\d+([.,]\d+)?$""")
                    if (!numberPattern.matches(value)) {
                        errors[field.label] = "Nur Zahlen erlaubt"
                        return@forEach
                    }
                }

                field.minLength?.let { min ->
                    if (value.length < min) {
                        errors[field.label] = "Mindestens $min Zeichen erforderlich"
                        return@forEach
                    }
                }

                field.maxLength?.let { max ->
                    if (value.length > max) {
                        errors[field.label] = "Maximal $max Zeichen erlaubt"
                        return@forEach
                    }
                }
            }
        }

        return errors
    }

    fun resetCreateState() {
        _createState.value = null
    }

    fun resetForm() {
        _selectedTopic.value = null
        _formResponses.value = mutableMapOf()
        _validationErrors.value = emptyMap()
        _createState.value = null
    }

    fun getFormFieldError(fieldLabel: String): String? {
        return _validationErrors.value?.get(fieldLabel)
    }

    fun hasValidationErrors(): Boolean {
        return _validationErrors.value?.isNotEmpty() == true
    }
}
