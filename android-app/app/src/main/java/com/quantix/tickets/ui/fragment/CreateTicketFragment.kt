package com.quantix.tickets.ui.fragment

import android.os.Bundle
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.core.widget.addTextChangedListener
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.MaterialAutoCompleteTextView
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.quantix.tickets.R
import com.quantix.tickets.data.model.FormField
import com.quantix.tickets.data.model.Topic
import com.quantix.tickets.data.repository.Resource
import com.quantix.tickets.ui.viewmodel.CreateTicketViewModel

class CreateTicketFragment : Fragment() {

    private val viewModel: CreateTicketViewModel by viewModels()

    private lateinit var toolbar: MaterialToolbar
    private lateinit var topicInputLayout: TextInputLayout
    private lateinit var topicDropdown: MaterialAutoCompleteTextView
    private lateinit var formFieldsContainer: LinearLayout
    private lateinit var createTicketButton: MaterialButton
    private lateinit var loadingProgress: ProgressBar
    private lateinit var divider: View
    private lateinit var formTitle: androidx.appcompat.widget.AppCompatTextView

    private var guildId: String? = null
    private val fieldInputs = mutableMapOf<String, TextInputEditText>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        guildId = arguments?.getString("guildId")
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_create_ticket, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        toolbar = view.findViewById(R.id.toolbar)
        topicInputLayout = view.findViewById(R.id.topicInputLayout)
        topicDropdown = view.findViewById(R.id.topicDropdown)
        formFieldsContainer = view.findViewById(R.id.formFieldsContainer)
        createTicketButton = view.findViewById(R.id.createTicketButton)
        loadingProgress = view.findViewById(R.id.loadingProgress)
        divider = view.findViewById(R.id.divider)
        formTitle = view.findViewById(R.id.formTitle)

        setupToolbar()
        setupCreateButton()
        observeViewModel()

        guildId?.let { viewModel.loadTopics(it) }
    }

    private fun setupToolbar() {
        toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun setupCreateButton() {
        createTicketButton.setOnClickListener {
            viewModel.validateAndCreateTicket()
        }
    }

    private fun observeViewModel() {
        viewModel.topicsState.observe(viewLifecycleOwner) { resource ->
            when (resource) {
                is Resource.Loading -> {
                    loadingProgress.visibility = View.VISIBLE
                }
                is Resource.Success -> {
                    loadingProgress.visibility = View.GONE
                    resource.data?.let { topics ->
                        setupTopicDropdown(topics)
                    }
                }
                is Resource.Error -> {
                    loadingProgress.visibility = View.GONE
                    view?.let {
                        Snackbar.make(it, resource.message ?: "Fehler beim Laden der Themen", Snackbar.LENGTH_LONG).show()
                    }
                }
            }
        }

        viewModel.selectedTopic.observe(viewLifecycleOwner) { topic ->
            if (topic != null) {
                showFormFields(topic.formFields)
                createTicketButton.isEnabled = true
            } else {
                hideFormFields()
                createTicketButton.isEnabled = false
            }
        }

        viewModel.createState.observe(viewLifecycleOwner) { resource ->
            when (resource) {
                is Resource.Loading -> {
                    createTicketButton.isEnabled = false
                    loadingProgress.visibility = View.VISIBLE
                }
                is Resource.Success -> {
                    loadingProgress.visibility = View.GONE
                    view?.let {
                        Snackbar.make(it, "Ticket erfolgreich erstellt!", Snackbar.LENGTH_SHORT).show()
                    }
                    findNavController().navigateUp()
                }
                is Resource.Error -> {
                    loadingProgress.visibility = View.GONE
                    createTicketButton.isEnabled = true
                    view?.let {
                        Snackbar.make(it, resource.message ?: "Fehler beim Erstellen", Snackbar.LENGTH_LONG).show()
                    }
                }
            }
        }

        viewModel.validationErrors.observe(viewLifecycleOwner) { errors ->
            clearErrors()
            errors.forEach { (fieldLabel, errorMessage) ->
                val input = fieldInputs[fieldLabel]
                input?.error = errorMessage
            }
        }
    }

    private fun setupTopicDropdown(topics: List<Topic>) {
        val topicNames = topics.map { it.displayName }
        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, topicNames)
        topicDropdown.setAdapter(adapter)

        topicDropdown.setOnItemClickListener { _, _, position, _ ->
            viewModel.selectTopic(topics[position])
        }
    }

    private fun showFormFields(fields: List<FormField>) {
        formFieldsContainer.removeAllViews()
        fieldInputs.clear()

        divider.visibility = View.VISIBLE
        formTitle.visibility = View.VISIBLE

        fields.forEach { field ->
            val fieldLayout = createFormField(field)
            formFieldsContainer.addView(fieldLayout)
        }
    }

    private fun hideFormFields() {
        formFieldsContainer.removeAllViews()
        fieldInputs.clear()
        divider.visibility = View.GONE
        formTitle.visibility = View.GONE
    }

    private fun createFormField(field: FormField): TextInputLayout {
        val textInputLayout = TextInputLayout(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = 16
            }
            hint = field.label + if (field.required) " *" else ""
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
        }

        val editText = TextInputEditText(textInputLayout.context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )

            when {
                field.isNumberOnly -> {
                    inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                    hint = field.displayPlaceholder
                }
                field.isParagraph -> {
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
                    minLines = 3
                    maxLines = 6
                    hint = field.placeholder
                }
                else -> {
                    inputType = InputType.TYPE_CLASS_TEXT
                    hint = field.placeholder
                }
            }

            addTextChangedListener {
                val value = it?.toString() ?: ""
                viewModel.updateFormResponse(field.label, value)
                error = null
            }
        }

        textInputLayout.addView(editText)
        fieldInputs[field.label] = editText

        return textInputLayout
    }

    private fun clearErrors() {
        fieldInputs.values.forEach { it.error = null }
    }
}
