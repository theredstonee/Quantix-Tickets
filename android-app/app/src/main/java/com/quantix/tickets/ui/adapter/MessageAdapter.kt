package com.quantix.tickets.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.quantix.tickets.R
import com.quantix.tickets.data.model.Message

class MessageAdapter : ListAdapter<Message, MessageAdapter.MessageViewHolder>(MessageDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_message, parent, false)
        return MessageViewHolder(view)
    }

    override fun onBindViewHolder(holder: MessageViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class MessageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {

        private val authorAvatar: ImageView = itemView.findViewById(R.id.authorAvatar)
        private val authorName: TextView = itemView.findViewById(R.id.authorName)
        private val messageTime: TextView = itemView.findViewById(R.id.messageTime)
        private val messageContent: TextView = itemView.findViewById(R.id.messageContent)
        private val systemMessageIndicator: View = itemView.findViewById(R.id.systemMessageIndicator)
        private val attachmentIndicator: TextView = itemView.findViewById(R.id.attachmentIndicator)

        fun bind(message: Message) {
            authorName.text = message.author.username
            messageTime.text = message.formattedTime
            messageContent.text = message.content

            Glide.with(itemView.context)
                .load(message.author.avatarUrl)
                .circleCrop()
                .placeholder(R.drawable.ic_launcher_foreground)
                .into(authorAvatar)

            if (message.isSystemMessage) {
                systemMessageIndicator.visibility = View.VISIBLE
                itemView.alpha = 0.7f
            } else {
                systemMessageIndicator.visibility = View.GONE
                itemView.alpha = 1.0f
            }

            if (message.hasAttachments) {
                attachmentIndicator.visibility = View.VISIBLE
                val count = message.attachments.size
                attachmentIndicator.text = "📎 $count Anhang${if (count > 1) "e" else ""}"
            } else {
                attachmentIndicator.visibility = View.GONE
            }
        }
    }

    class MessageDiffCallback : DiffUtil.ItemCallback<Message>() {
        override fun areItemsTheSame(oldItem: Message, newItem: Message): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: Message, newItem: Message): Boolean {
            return oldItem == newItem
        }
    }
}
