import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/models/consultation.dart';
import '../core/providers/consultation_provider.dart';

class ConsultationListScreen extends ConsumerStatefulWidget {
  const ConsultationListScreen({super.key});

  @override
  ConsumerState<ConsultationListScreen> createState() =>
      _ConsultationListScreenState();
}

class _ConsultationListScreenState
    extends ConsumerState<ConsultationListScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    ref.read(consultationProvider.notifier).fetchConsultations();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(consultationProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Consultations'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Upcoming'),
            Tab(text: 'Active'),
            Tab(text: 'History'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/consultations/book'),
        icon: const Icon(Icons.add),
        label: const Text('Book'),
      ),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
              ? Center(
                  child: Text(
                    state.error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                )
              : TabBarView(
                  controller: _tabs,
                  children: [
                    _ConsultationList(
                      items: state.items
                          .where((c) => c.status == 'scheduled')
                          .toList(),
                      emptyText: 'No upcoming consultations',
                    ),
                    _ConsultationList(
                      items: state.items
                          .where((c) => c.status == 'in_progress')
                          .toList(),
                      emptyText: 'No active consultations',
                    ),
                    _ConsultationList(
                      items: state.items
                          .where((c) =>
                              c.status == 'completed' ||
                              c.status == 'cancelled')
                          .toList(),
                      emptyText: 'No past consultations',
                    ),
                  ],
                ),
    );
  }
}

class _ConsultationList extends StatelessWidget {
  final List<Consultation> items;
  final String emptyText;

  const _ConsultationList({required this.items, required this.emptyText});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        child: Text(
          emptyText,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        // Re-fetch handled by parent
      },
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) => _ConsultationCard(item: items[index]),
      ),
    );
  }
}

class _ConsultationCard extends ConsumerWidget {
  final Consultation item;
  const _ConsultationCard({required this.item});

  Color _statusColor(String status) {
    switch (status) {
      case 'in_progress':
        return Colors.green;
      case 'scheduled':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/consultations/${item.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    item.type == 'telemedicine'
                        ? Icons.videocam_outlined
                        : Icons.local_hospital_outlined,
                    size: 18,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      item.doctorName ?? 'Dr. (Assigned)',
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: _statusColor(item.status).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: _statusColor(item.status).withOpacity(0.5)),
                    ),
                    child: Text(
                      item.status.replaceAll('_', ' ').toUpperCase(),
                      style: TextStyle(
                        fontSize: 10,
                        color: _statusColor(item.status),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              if (item.specialization != null) ...[
                const SizedBox(height: 4),
                Text(
                  item.specialization!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
              if (item.chiefComplaint != null) ...[
                const SizedBox(height: 8),
                Text(
                  item.chiefComplaint!,
                  style: theme.textTheme.bodyMedium,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (item.scheduledAt != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.schedule, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      DateFormat('dd MMM yyyy, HH:mm')
                          .format(item.scheduledAt!.toLocal()),
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ],
              if (item.status == 'in_progress') ...[
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/consultations/${item.id}'),
                  icon: const Icon(Icons.videocam, size: 16),
                  label: const Text('Join Now'),
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
