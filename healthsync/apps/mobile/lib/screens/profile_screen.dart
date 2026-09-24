import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../core/providers/auth_provider.dart';

// ─── Screen ──────────────────────────────────────────────────────────────────

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  Map<String, dynamic>? _profile;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final token = ref.read(authProvider).accessToken;
      final client = ApiClient();
      final res = await client.get(
        '/v1/patients/me',
        port: 3002,
        token: token,
      );
      setState(() => _profile = res['data'] as Map<String, dynamic>?);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sign out')),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(authProvider.notifier).logout();
      if (mounted) context.go('/login');
    }
  }

  Widget _infoRow(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label,
                style: const TextStyle(
                    color: Colors.grey, fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: Text(value ?? '—',
                style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final user = authState.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetch,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // ── Avatar ─────────────────────────────────────────────
                  Center(
                    child: Column(
                      children: [
                        CircleAvatar(
                          radius: 48,
                          backgroundColor:
                              const Color(0xFF1976D2).withOpacity(0.12),
                          child: Text(
                            (user?.name ?? user?.email ?? 'U')
                                    .substring(0, 1)
                                    .toUpperCase(),
                            style: const TextStyle(
                                fontSize: 36,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF1976D2)),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          user?.name ?? user?.email ?? 'Unknown',
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color:
                                const Color(0xFF1976D2).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Text(
                            user?.role ?? '',
                            style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF1976D2),
                                fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // ── Account info ────────────────────────────────────────
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Account',
                              style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16)),
                          const Divider(height: 20),
                          _infoRow('Email', user?.email),
                          _infoRow('Phone', user?.phone),
                          _infoRow('Role', user?.role),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // ── Patient info (if available) ─────────────────────────
                  if (_error == null && _profile != null)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Health Profile',
                                style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 16)),
                            const Divider(height: 20),
                            _infoRow('NIK', _profile!['nik'] as String?),
                            _infoRow('Blood Type',
                                _profile!['bloodType'] as String?),
                            _infoRow('Date of Birth',
                                _profile!['dateOfBirth'] as String?),
                            _infoRow('BPJS No.',
                                _profile!['bpjsNumber'] as String?),
                            _infoRow(
                                'Allergies',
                                (_profile!['allergies'] as List<dynamic>?)
                                        ?.join(', ') ??
                                    'None'),
                          ],
                        ),
                      ),
                    ),

                  if (_error != null)
                    Card(
                      color: Colors.red.shade50,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            const Icon(Icons.info_outline, color: Colors.red),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Could not load health profile.',
                                style: const TextStyle(color: Colors.red),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                  const SizedBox(height: 24),

                  // ── Quick links ────────────────────────────────────────
                  Card(
                    child: Column(
                      children: [
                        ListTile(
                          leading: const Icon(Icons.history,
                              color: Color(0xFF1976D2)),
                          title: const Text('Consultation History'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/consultations'),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(Icons.medication,
                              color: Color(0xFF1976D2)),
                          title: const Text('My Prescriptions'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/prescriptions'),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(Icons.monitor_heart,
                              color: Color(0xFF1976D2)),
                          title: const Text('Vitals Monitor'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/vitals'),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // ── Sign out ───────────────────────────────────────────
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _logout,
                      icon: const Icon(Icons.logout, color: Colors.red),
                      label: const Text('Sign out',
                          style: TextStyle(color: Colors.red)),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.red),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
