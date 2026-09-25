import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';

class NotificationsDokterScreen extends ConsumerStatefulWidget {
  const NotificationsDokterScreen({super.key});

  @override
  ConsumerState<NotificationsDokterScreen> createState() =>
      _NotificationsDokterScreenState();
}

class _NotificationsDokterScreenState
    extends ConsumerState<NotificationsDokterScreen> {
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  String? _error;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.get('/v1/notifications?limit=50', port: 3009);
      final raw = response['data'];
      if (!mounted) return;
      setState(() {
        _items = raw is Map && raw['notifications'] is List
            ? _asMapList(raw['notifications'])
            : const [];
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.detail;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Gagal memuat notifikasi.';
      });
    }
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
  }

  Future<void> _markAllRead() async {
    final ids = _items
        .where((item) => item['read_at'] == null)
        .map((item) => item['id']?.toString())
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toList();
    if (ids.isEmpty) return;
    try {
      await _api.put(
        '/v1/notifications/read',
        port: 3009,
        body: {'notificationIds': ids},
      );
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.detail)));
    }
  }

  Future<void> _openReference(Map<String, dynamic> item) async {
    final id = item['reference_id']?.toString();
    if (id == null || id.isEmpty) return;
    final notificationId = item['id']?.toString();
    if (item['read_at'] == null && notificationId != null && notificationId.isNotEmpty) {
      try {
        await _api.put(
          '/v1/notifications/read',
          port: 3009,
          body: {'notificationIds': [notificationId]},
        );
      } on ApiException {
        // Navigation should remain available if marking read is temporarily unavailable.
      }
    }
    switch (item['reference_type']?.toString()) {
      case 'CONSULTATION':
        context.push('/doctor/consultations/$id');
        break;
      case 'PRESCRIPTION':
        context.push('/doctor/prescriptions/$id');
        break;
      case 'REFERRAL':
        context.push('/doctor/referrals');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [
          TextButton(
            onPressed: _loading ? null : _markAllRead,
            child: const Text('Tandai dibaca'),
          ),
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Card(
                      color: Colors.red.shade50,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                      ),
                    ),
                  if (_items.isEmpty)
                    const Card(child: ListTile(title: Text('Belum ada notifikasi.')))
                  else
                    ..._items.map(
                      (item) => Card(
                        child: ListTile(
                          leading: Icon(
                            item['read_at'] == null
                                ? Icons.notifications_active_outlined
                                : Icons.notifications_none,
                          ),
                          title: Text(item['title']?.toString() ?? 'Notifikasi'),
                          subtitle: Text(
                            '${item['body'] ?? '-'}\n'
                            '${item['priority'] ?? 'NORMAL'} • ${item['created_at'] ?? '-'}',
                          ),
                          isThreeLine: true,
                          onTap: () => _openReference(item),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}