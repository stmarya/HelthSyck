import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/driver_order.dart';
import '../../../core/providers/driver_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Halaman daftar order aktif untuk Driver
class OrderAktifScreen extends ConsumerStatefulWidget {
  const OrderAktifScreen({super.key});

  @override
  ConsumerState<OrderAktifScreen> createState() => _OrderAktifScreenState();
}

class _OrderAktifScreenState extends ConsumerState<OrderAktifScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() =>
        ref.read(driverOrderProvider.notifier).fetchOrders());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(driverOrderProvider);
    final aktif = state.items
        .where((o) =>
            o.status != StatusOrder.selesai &&
            o.status != StatusOrder.dibatalkan)
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      appBar: AppBar(
        title: const Text('Order Aktif'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () =>
                ref.read(driverOrderProvider.notifier).fetchOrders(),
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : aktif.isEmpty
              ? const EmptyState(
                  icon: Icons.local_shipping_rounded,
                  title: 'Tidak ada order aktif',
                  subtitle:
                      'Pastikan status kamu Online untuk menerima order baru',
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(AppTheme.sM),
                  itemCount: aktif.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(height: AppTheme.sS),
                  itemBuilder: (_, i) => _OrderDetailCard(
                    order: aktif[i],
                    onUpdateStatus: (status) => ref
                        .read(driverOrderProvider.notifier)
                        .updateStatusOrder(aktif[i].id, status),
                  ),
                ),
    );
  }
}

class _OrderDetailCard extends StatelessWidget {
  final DriverOrder order;
  final void Function(String) onUpdateStatus;

  const _OrderDetailCard(
      {required this.order, required this.onUpdateStatus});

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.driverGradient().colors.first;
    return HealthCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(order.pasienNama,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 15)),
                    Text(order.apotek,
                        style: const TextStyle(
                            fontSize: 12, color: AppTheme.abu500)),
                  ],
                ),
              ),
              StatusBadge.auto(order.status),
            ],
          ),

          const Divider(height: AppTheme.sM + AppTheme.sS),

          // Alamat
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.location_on_rounded,
                  size: 16, color: AppTheme.bahaya),
              const SizedBox(width: AppTheme.sS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Tujuan Pengiriman',
                        style: TextStyle(
                            fontSize: 11, color: AppTheme.abu500)),
                    Text(order.pasienAlamat,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ],
          ),

          if (order.catatanAlamat != null) ...[
            const SizedBox(height: AppTheme.sS),
            Container(
              padding: const EdgeInsets.all(AppTheme.sS),
              decoration: BoxDecoration(
                color: AppTheme.abu100,
                borderRadius: BorderRadius.circular(AppTheme.rS),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline_rounded,
                      size: 14, color: AppTheme.abu500),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(order.catatanAlamat!,
                        style: const TextStyle(
                            fontSize: 12, color: AppTheme.abu700)),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: AppTheme.sM),

          // Items
          const SectionHeader(title: 'Item Obat'),
          const SizedBox(height: AppTheme.sS),
          ...order.items.map((item) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    const Icon(Icons.circle, size: 5, color: AppTheme.abu500),
                    const SizedBox(width: AppTheme.sS),
                    Text(item,
                        style: const TextStyle(
                            fontSize: 13, color: AppTheme.abu700)),
                  ],
                ),
              )),

          const SizedBox(height: AppTheme.sM),

          // Info jarak & ongkir
          if (order.jarakKm != null || order.ongkir != null)
            Row(
              children: [
                if (order.jarakKm != null)
                  _InfoPill(
                      icon: Icons.straighten_rounded,
                      label:
                          '${order.jarakKm!.toStringAsFixed(1)} km'),
                if (order.jarakKm != null && order.ongkir != null)
                  const SizedBox(width: AppTheme.sS),
                if (order.ongkir != null)
                  _InfoPill(
                      icon: Icons.payments_rounded,
                      label:
                          'Rp ${order.ongkir!.toStringAsFixed(0)}'),
              ],
            ),

          const SizedBox(height: AppTheme.sM),

          // Aksi
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      context.push('/driver/navigasi/${order.id}'),
                  icon: const Icon(Icons.navigation_rounded, size: 16),
                  label: const Text('Navigasi'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: color,
                    side: BorderSide(color: color),
                    minimumSize: const Size(0, 40),
                  ),
                ),
              ),
              const SizedBox(width: AppTheme.sS),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _updateNext(context),
                  icon: Icon(_nextIcon(), size: 16),
                  label: Text(_nextLabel()),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 40),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _nextLabel() {
    switch (order.status) {
      case StatusOrder.diterima:
        return 'Menuju Apotek';
      case StatusOrder.menuju:
        return 'Obat Diambil';
      case StatusOrder.diambil:
        return 'Mulai Antar';
      case StatusOrder.diantar:
        return 'Selesai Antar';
      default:
        return 'Update';
    }
  }

  IconData _nextIcon() {
    switch (order.status) {
      case StatusOrder.diterima:
        return Icons.store_rounded;
      case StatusOrder.menuju:
        return Icons.medication_rounded;
      case StatusOrder.diambil:
        return Icons.delivery_dining_rounded;
      case StatusOrder.diantar:
        return Icons.check_rounded;
      default:
        return Icons.arrow_forward_rounded;
    }
  }

  void _updateNext(BuildContext context) {
    final nextStatus = <String, String>{
      StatusOrder.diterima: StatusOrder.menuju,
      StatusOrder.menuju: StatusOrder.diambil,
      StatusOrder.diambil: StatusOrder.diantar,
      StatusOrder.diantar: StatusOrder.selesai,
    }[order.status];
    if (nextStatus != null) onUpdateStatus(nextStatus);
  }
}

class _InfoPill extends StatelessWidget {
  final IconData icon;
  final String label;
  const _InfoPill({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTheme.abu100,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppTheme.abu500),
          const SizedBox(width: 4),
          Text(label,
              style: const TextStyle(fontSize: 11, color: AppTheme.abu700)),
        ],
      ),
    );
  }
}
