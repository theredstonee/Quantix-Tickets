package com.quantix.tickets.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.quantix.tickets.R
import com.quantix.tickets.data.model.Server

class ServerAdapter(
    private val onServerClick: (Server) -> Unit
) : ListAdapter<Server, ServerAdapter.ServerViewHolder>(ServerDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ServerViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_server, parent, false)
        return ServerViewHolder(view, onServerClick)
    }

    override fun onBindViewHolder(holder: ServerViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class ServerViewHolder(
        itemView: View,
        private val onServerClick: (Server) -> Unit
    ) : RecyclerView.ViewHolder(itemView) {

        private val cardView: CardView = itemView.findViewById(R.id.serverCard)
        private val serverIcon: ImageView = itemView.findViewById(R.id.serverIcon)
        private val serverName: TextView = itemView.findViewById(R.id.serverName)
        private val memberCount: TextView = itemView.findViewById(R.id.memberCount)
        private val adminBadge: TextView = itemView.findViewById(R.id.adminBadge)

        fun bind(server: Server) {
            serverName.text = server.name
            memberCount.text = server.memberCountText

            Glide.with(itemView.context)
                .load(server.iconUrl)
                .circleCrop()
                .placeholder(R.drawable.ic_launcher_foreground)
                .into(serverIcon)

            if (server.isAdmin) {
                adminBadge.visibility = View.VISIBLE
            } else {
                adminBadge.visibility = View.GONE
            }

            cardView.setOnClickListener {
                onServerClick(server)
            }
        }
    }

    class ServerDiffCallback : DiffUtil.ItemCallback<Server>() {
        override fun areItemsTheSame(oldItem: Server, newItem: Server): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: Server, newItem: Server): Boolean {
            return oldItem == newItem
        }
    }
}
