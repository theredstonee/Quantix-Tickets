package com.quantix.tickets.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.quantix.tickets.R
import com.quantix.tickets.data.model.Ticket
import java.text.SimpleDateFormat
import java.util.*

class TicketAdapter(
    private val onTicketClick: (Ticket) -> Unit
) : ListAdapter<Ticket, TicketAdapter.TicketViewHolder>(TicketDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TicketViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_ticket, parent, false)
        return TicketViewHolder(view, onTicketClick)
    }

    override fun onBindViewHolder(holder: TicketViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class TicketViewHolder(
        itemView: View,
        private val onTicketClick: (Ticket) -> Unit
    ) : RecyclerView.ViewHolder(itemView) {

        private val cardView: CardView = itemView.findViewById(R.id.ticketCard)
        private val ticketIdText: TextView = itemView.findViewById(R.id.ticketIdText)
        private val topicText: TextView = itemView.findViewById(R.id.topicText)
        private val statusText: TextView = itemView.findViewById(R.id.statusText)
        private val priorityIndicator: View = itemView.findViewById(R.id.priorityIndicator)
        private val creatorText: TextView = itemView.findViewById(R.id.creatorText)
        private val dateText: TextView = itemView.findViewById(R.id.dateText)
        private val claimerText: TextView = itemView.findViewById(R.id.claimerText)
        private val lastMessageText: TextView = itemView.findViewById(R.id.lastMessageText)
        private val unreadBadge: TextView = itemView.findViewById(R.id.unreadBadge)

        fun bind(ticket: Ticket) {
            ticketIdText.text = "${ticket.priorityEmoji} Ticket #${ticket.ticketId}"
            topicText.text = ticket.topic
            statusText.text = "${ticket.statusEmoji} ${if (ticket.isOpen) "Offen" else "Geschlossen"}"

            priorityIndicator.setBackgroundColor(ticket.priorityColor)

            creatorText.text = "Von: ${ticket.creator?.username ?: "Unbekannt"}"

            val dateFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMAN)
            val date = Date(ticket.createdAt)
            dateText.text = dateFormat.format(date)

            if (ticket.claimer != null) {
                claimerText.visibility = View.VISIBLE
                claimerText.text = "🔒 ${ticket.claimer.username}"
            } else {
                claimerText.visibility = View.GONE
            }

            if (ticket.lastMessage != null) {
                lastMessageText.visibility = View.VISIBLE
                val preview = ticket.lastMessage.content.take(100)
                lastMessageText.text = "💬 $preview${if (ticket.lastMessage.content.length > 100) "..." else ""}"
            } else {
                lastMessageText.visibility = View.GONE
            }

            if (ticket.unreadCount > 0) {
                unreadBadge.visibility = View.VISIBLE
                unreadBadge.text = ticket.unreadCount.toString()
            } else {
                unreadBadge.visibility = View.GONE
            }

            cardView.setOnClickListener {
                onTicketClick(ticket)
            }
        }
    }

    class TicketDiffCallback : DiffUtil.ItemCallback<Ticket>() {
        override fun areItemsTheSame(oldItem: Ticket, newItem: Ticket): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: Ticket, newItem: Ticket): Boolean {
            return oldItem == newItem
        }
    }
}
