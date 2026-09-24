import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_theme.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/realtime_location_tracker.dart';
import '../../../core/providers/driver_provider.dart';
import '../../../core/models/driver_order.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Dashboard utama untuk role Driver Apotek
class DashboardDriverScreen extends ConsumerStatefulWidget {
  const DashboardDriverScreen({super.key});

  @override
  ConsumerState<DashboardDriverScreen> createState() =>
      _DashboardDriverScreenState();
}

class _DashboardDriverScreenState
    extends ConsumerState<DashboardDriverScreen> {
  RealtimeLocationTracker? _locationTracker;
  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      final userId = ref.read(authProvider).user?.id;
      ref.read(driverOrderProvider.notifier).fetchOrders(driverUserId: userId);
      final auth = ref.read(authProvider);
      final token = auth.accessToken;
      final entityId = auth.user?.id;
      if (token != null && entityId != null && entityId.isNotEmpty) {
        _locationTracker = RealtimeLocationTracker(accessToken: token, entityId: entityId, entityType: 'DRIVER');
        await _locationTracker!.start();
      }
    });
  }

  @override
  void dispose() {
    _locationTracker?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final state = ref.watch(driverOrderProvider);
    final stat = ref.watch(driverStatProvider);

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(driverOrderProvider.notifier).fetchOrders(),
        child: CustomScrollView(
          slivers: [
            // ── App Bar dengan Hero Gradient ────────────────
            SliverAppBar(
              expandedHeight: 180,
              pinned: true,
              backgroundColor: Colors.white,
              foregroundColor: AppTheme.abu900,
              elevation: 0,
              actions: [
                IconButton(
                  icon: const Icon(Icons.logout_rounded),
                  onPressed: () =>
                      ref.read(authProvider.notifier).logout(),
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: BoxDecoration(
                    gradient: AppTheme.driverGradient(),
                  ),
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(AppTheme.sM),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.2),
                                  borderRadius:
                                      BorderRadius.circular(AppTheme.rS),
                                ),
                                child: const Icon(
                                  Icons.delivery_dining_rounded,
                                  color: Colors.white,
                                  size: 28,
                                ),
                              ),
                              const SizedBox(width: AppTheme.sM),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Selamat datang,',
                                      style: TextStyle(
                                        color:
                                            Colors.white.withOpacity(0.85),
                                        fontSize: 13,
                                      ),
                                    ),
                                    Text(
                                      user?.name ?? 'Driver',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppTheme.sM),
                          // Toggle Online/Offline
                          _OnlineToggle(
                            isOnline: state.isOnline,
                            onToggle: (val) => ref
                                .read(driverOrderProvider.notifier)
                                .toggleOnline(val),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),

            SliverPadding(
              padding: const EdgeInsets.all(AppTheme.sM),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // ── KPI Row ───────────────────────────────────
                  Row(
                    children: [
                      Expanded(
                        child: KpiCard(
                          label: 'Order Aktif',
                          value: '${stat['aktif'] ?? 0}',
                          icon: Icons.local_shipping_rounded,
                          color: AppTheme.driverGradient().colors.first,
                          onTap: () => context.push('/driver/order'),
                        ),
                      ),
                      const SizedBox(width: AppTheme.sS),
                      Expanded(
                        child: KpiCard(
                          label: 'Selesai Hari Ini',
                          value: '${stat['selesai'] ?? 0}',
                          icon: Icons.check_circle_rounded,
                          color: AppTheme.sukses,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: AppTheme.sL),

                  // ── Order Aktif Banner ────────────────────────
                  if (state.orderAktif != null) ...[
                    const SectionHeader(title: 'Order Sedang Berjalan'),
                    const SizedBox(height: AppTheme.sS),
                    _OrderAktifBanner(order: state.orderAktif!),
                    const SizedBox(height: AppTheme.sL),
                  ],

                  // ── Daftar Order Terbaru ──────────────────────
                  SectionHeader(
                    title: 'Order Terbaru',
                    actionLabel: 'Lihat Semua',
                    onAction: () => context.push('/driver/riwayat'),
                  ),
                  const SizedBox(height: AppTheme.sM),
                  if (state.isLoading)
                    const Center(child: CircularProgressIndicator())
                  else if (state.items.isEmpty)
                    const EmptyState(
                      icon: Icons.delivery_dining_rounded,
                      title: 'Belum ada order',
                      subtitle:
                          'Order pengiriman obat akan muncul di sini',
                    )
                  else
                    ...state.items.take(3).map((o) => Padding(
                          padding:
                              const EdgeInsets.only(bottom: AppTheme.sS),
                          child: _OrderTileKecil(order: o),
                        )),

                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildBottomNav(context, 0),
    );
  }

  Widget _buildBottomNav(BuildContext context, int index) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppTheme.abu200)),
      ),
      child: BottomNavigationBar(
        currentIndex: index,
        onTap: (i) {
          switch (i) {
            case 0:
              context.go('/driver');
              break;
            case 1:
              context.go('/driver/order');
              break;
            case 2:
              context.go('/driver/riwayat');
              break;
          }
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_rounded),
            label: 'Beranda',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.local_shipping_rounded),
            label: 'Order Aktif',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history_rounded),
            label: 'Riwayat',
          ),
        ],
      ),
    );
  }
}

// ── Widget Pendukung ─────────────────────────────────────────────────────────

class _OnlineToggle extends StatelessWidget {
  final bool isOnline;
  final ValueChanged<bool> onToggle;

  const _OnlineToggle({required this.isOnline, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onToggle(!isOnline),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.sM, vertical: AppTheme.sS),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(isOnline ? 0.25 : 0.15),
          borderRadius: BorderRadius.circular(AppTheme.rXL),
          border: Border.all(
            color: Colors.white.withOpacity(0.4),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: isOnline ? Colors.greenAccent : Colors.white54,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: AppTheme.sS),
            Text(
              isOnline ? 'Online — Siap Menerima Order' : 'Offline',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: AppTheme.sS),
            Icon(
              isOnline ? Icons.toggle_on_rounded : Icons.toggle_off_rounded,
              color: isOnline ? Colors.greenAccent : Colors.white54,
              size: 24,
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderAktifBanner extends StatelessWidget {
  final DriverOrder order;
  const _OrderAktifBanner({required this.order});

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.driverGradient().colors.first;
    return HealthCard(
      borderColor: color.withOpacity(0.4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.local_shipping_rounded, color: color, size: 18),
              const SizedBox(width: AppTheme.sS),
              Text(
                'Sedang Diantar',
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              StatusBadge.auto(order.status),
            ],
          ),
          const Divider(height: AppTheme.sM + AppTheme.sS),
          Text(order.pasienNama,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 2),
          Row(
            children: [
              const Icon(Icons.location_on_rounded,
                  size: 14, color: AppTheme.abu500),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  order.pasienAlamat,
                  style: const TextStyle(
                      fontSize: 13, color: AppTheme.abu500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (order.jarakKm != null) ...[
            const SizedBox(height: AppTheme.sS),
            Row(
              children: [
                _InfoChip(
                    icon: Icons.straighten_rounded,
                    label: '${order.jarakKm!.toStringAsFixed(1)} km'),
                const SizedBox(width: AppTheme.sS),
                if (order.estimasiMenit != null)
                  _InfoChip(
                      icon: Icons.access_time_rounded,
                      label:
                          '~${order.estimasiMenit!.toInt()} menit'),
              ],
            ),
          ],
          const SizedBox(height: AppTheme.sM),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () =>
                  context.push('/driver/navigasi/${order.id}'),
              icon: const Icon(Icons.navigation_rounded, size: 18),
              label: const Text('Buka Navigasi'),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderTileKecil extends StatelessWidget {
  final DriverOrder order;
  const _OrderTileKecil({required this.order});

  @override
  Widget build(BuildContext context) {
    return HealthCard(
      onTap: () => context.push('/driver/navigasi/${order.id}'),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppTheme.abu200,
              borderRadius: BorderRadius.circular(AppTheme.rS),
            ),
            child: const Icon(Icons.delivery_dining_rounded,
                size: 18, color: AppTheme.abu500),
          ),
          const SizedBox(width: AppTheme.sM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(order.pasienNama,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14)),
                Text(
                  order.apotek,
                  style: const TextStyle(
                      fontSize: 12, color: AppTheme.abu500),
                ),
              ],
            ),
          ),
          StatusBadge.auto(order.status),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _InfoChip({required this.icon, required this.label});

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
              style: const TextStyle(
                  fontSize: 11, color: AppTheme.abu700)),
        ],
      ),
    );
  }
}

