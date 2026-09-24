import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/consultation.dart';
import '../core/providers/consultation_provider.dart';

// ─────────────────────────────────────────────
// Per-consultation messages provider
// ─────────────────────────────────────────────

final _messagesProvider = FutureProvider.family<List<ConsultationMessage>, String>(
  (ref, consultationId) => ref
      .read(consultationProvider.notifier)
      .fetchMessages(consultationId),
);

// ─────────────────────────────────────────────
// Consultation room screen (telemedicine chat)
// ─────────────────────────────────────────────

class ConsultationRoomScreen extends ConsumerStatefulWidget {
  final String consultationId;
  const ConsultationRoomScreen({super.key, required this.consultationId});

  @override
  ConsumerState<ConsultationRoomScreen> createState() =>
      _ConsultationRoomScreenState();
}

class _ConsultationRoomScreenState
    extends ConsumerState<ConsultationRoomScreen> {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<ConsultationMessage> _messages = [];
  Timer? _pollTimer;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    // Poll for new messages every 5 seconds
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _loadMessages(silent: true);
    });
  }

  Future<void> _loadMessages({bool silent = false}) async {
    final msgs = await ref
        .read(consultationProvider.notifier)
        .fetchMessages(widget.consultationId);
    if (mounted) {
      setState(() {
        _messages
          ..clear()
          ..addAll(msgs);
      });
      if (!silent) _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;

    setState(() => _sending = true);
    _msgCtrl.clear();

    final msg = await ref.read(consultationProvider.notifier).sendMessage(
          consultationId: widget.consultationId,
          content: text,
        );

    if (msg != null && mounted) {
      setState(() => _messages.add(msg));
      _scrollToBottom();
    }
    if (mounted) setState(() => _sending = false);
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Find this consultation from the provider
    final consultation = ref
        .watch(consultationProvider)
        .items
        .where((c) => c.id == widget.consultationId)
        .firstOrNull;

    final theme = Theme.of(context);
    final myId = ''; // pulled from authProvider in real usage

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              consultation?.doctorName ?? 'Consultation',
              style: const TextStyle(fontSize: 16),
            ),
            if (consultation?.status != null)
              Text(
                consultation!.status.toUpperCase(),
                style: TextStyle(
                  fontSize: 11,
                  color: consultation.status == 'in_progress'
                      ? Colors.green
                      : theme.colorScheme.onSurfaceVariant,
                ),
              ),
          ],
        ),
        actions: [
          if (consultation?.type == 'telemedicine')
            IconButton(
              icon: const Icon(Icons.videocam_outlined),
              tooltip: 'Start Video',
              onPressed: () {
                // TODO: integrate WebRTC/video SDK
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Video call — coming soon')),
                );
              },
            ),
        ],
      ),
      body: Column(
        children: [
          // Chief complaint banner
          if (consultation?.chiefComplaint != null)
            Container(
              width: double.infinity,
              color: theme.colorScheme.surfaceContainerHighest,
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Text(
                'Chief Complaint: ${consultation!.chiefComplaint}',
                style: theme.textTheme.bodySmall,
              ),
            ),

          // Messages list
          Expanded(
            child: _messages.isEmpty
                ? const Center(
                    child: Text(
                      'No messages yet.\nStart the conversation below.',
                      textAlign: TextAlign.center,
                    ),
                  )
                : ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 16),
                    itemCount: _messages.length,
                    itemBuilder: (context, i) => _MessageBubble(
                      message: _messages[i],
                      isMe: _messages[i].senderRole == 'patient',
                    ),
                  ),
          ),

          // Input bar
          if (consultation?.status == 'in_progress' ||
              consultation?.status == 'scheduled')
            SafeArea(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  border: Border(
                    top: BorderSide(
                      color: theme.colorScheme.outlineVariant,
                    ),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _msgCtrl,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        decoration: const InputDecoration(
                          hintText: 'Type a message…',
                          border: OutlineInputBorder(),
                          contentPadding: EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          isDense: true,
                        ),
                        minLines: 1,
                        maxLines: 4,
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: _sending ? null : _send,
                      icon: _sending
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Message bubble widget
// ─────────────────────────────────────────────

class _MessageBubble extends StatelessWidget {
  final ConsultationMessage message;
  final bool isMe;

  const _MessageBubble({required this.message, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bubbleColor = isMe
        ? theme.colorScheme.primary
        : theme.colorScheme.surfaceContainerHighest;
    final textColor =
        isMe ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface;

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isMe ? 16 : 4),
            bottomRight: Radius.circular(isMe ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment:
              isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (!isMe)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  message.senderRole == 'doctor' ? 'Doctor' : 'Patient',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ),
            Text(message.content, style: TextStyle(color: textColor)),
            const SizedBox(height: 2),
            Text(
              _formatTime(message.createdAt),
              style: TextStyle(
                fontSize: 10,
                color: textColor.withOpacity(0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final local = dt.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
