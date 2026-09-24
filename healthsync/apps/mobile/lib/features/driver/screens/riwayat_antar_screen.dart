import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/driver_order.dart';
import '../../../core/providers/driver_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Halaman riwayat pengantaran untuk Driver
class RiwayatAntarScreen extends ConsumerStatefulWidget {
  const RiwayatAntarScreen({super.key});

  @override
  ConsumerState<RiwayatAntarScreen> createState() =>
      _RiwayatAntarScreenState();
}

class _RiwayatAntarScreenState extends ConsumerState<RiwayatAntarScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() =>
        ref.read(driverOrderProvider.notifier).fetchOrders());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(driverOrderProvider);
    final stat = ref.watch(driverStatProvider);
    final selesai = state.items
        .where((o) =>
            o.status == StatusOrder.selesai ||
            o.status == StatusOrder.dibatalkan)
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      appBar: AppBar(
        title: const Text('Riwayat Pengantaran'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
      ),
      body: Column(
        children: [
          // ── Summary ───────────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(AppTheme.sM),
            child: Row(
              children: [
                Expanded(
                  child: _StatCard(
                    label: 'Total Order',
                    value: '${stat['total'] ?? 0}',
                    color: AppTheme.info,
                  ),
                ),
                const SizedBox(width: AppTheme.sS),
                Expanded(
                  child: _StatCard(
                    label: 'Terkirim',
                    value:
                        '${selesai.where((o) => o.status == StatusOrder.selesai).length}',
                    color: AppTheme.sukses,
                  ),
                ),
                const SizedBox(width: AppTheme.sS),
                Expanded(
                  child: _StatCard(
                    label: 'Dibatalkan',
                    value:
                        '${selesai.where((o) => o.status == StatusOrder.dibatalkan).length}',
                    color: AppTheme.bahaya,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // ── Daftar ───────────────────────────────────────
          Expanded(
            child: state.isLoading
                ? const Center(child: CircularProgressIndicator())
                : selesai.isEmpty
                    ? const EmptyState(
                        icon: Icons.history_rounded,
                        title: 'Belum ada riwayat',
                        subtitle:
                            'Order yang sudah selesai akan tampil di sini',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppTheme.sM),
                        itemCount: selesai.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppTheme.sS),
                        itemBuilder: (_, i) {
                          final o = selesai[i];
                          return HealthCard(
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: AppTheme.abu200,
                                    borderRadius: BorderRadius.circular(
                                        AppTheme.rS),
                                  ),
                                  child: const Icon(
                                      Icons.delivery_dining_rounded,
                                      size: 18,
                                      color: AppTheme.abu500),
                                ),
                                const SizedBox(width: AppTheme.sM),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(o.pasienNama,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 14)),
                                      Text(
                                        '${o.apotek}${o.jarakKm != null ? ' · ${o.jarakKm!.toStringAsFixed(1)} km' : ''}',
                                        style: const TextStyle(
                                            fontSize: 12,
                                            color: AppTheme.abu500),
                                      ),
                                      Text(
                                        _formatTanggal(o.createdAt),
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: AppTheme.abu500),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.end,
                                  children: [
                                    StatusBadge.auto(o.status),
                                    if (o.ongkir != null) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        'Rp ${o.ongkir!.toStringAsFixed(0)}',
                                        style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: AppTheme.sukses),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  String _formatTanggal(DateTime dt) {
    final bulan = [
      '',
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    return '${dt.day} ${bulan[dt.month]} ${dt.year}';
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCard(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          vertical: AppTheme.sM, horizontal: AppTheme.sS),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(AppTheme.rS),
      ),
      child: Column(
        children: [
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color)),
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppTheme.abu500)),
        ],
      ),
    );
  }
}
