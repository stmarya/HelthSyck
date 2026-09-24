import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/driver_order.dart';
import '../../../core/providers/driver_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';

/// Halaman simulasi navigasi untuk Driver (tanpa library peta pihak ketiga)
class NavigasiScreen extends ConsumerWidget {
  final String orderId;
  const NavigasiScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(driverOrderProvider);
    final order = state.items.where((o) => o.id == orderId).firstOrNull;

    if (order == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Navigasi')),
        body: const Center(child: Text('Order tidak ditemukan')),
      );
    }

    final color = AppTheme.driverGradient().colors.first;

    return Scaffold(
      backgroundColor: AppTheme.abu900,
      appBar: AppBar(
        title: const Text('Navigasi'),
        backgroundColor: AppTheme.abu900,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Column(
        children: [
          // ── Peta Simulasi ─────────────────────────────────
          Expanded(
            child: Stack(
              children: [
                // Background peta simulasi
                Container(
                  color: const Color(0xFF1A2332),
                  child: CustomPaint(
                    painter: _MapPainter(),
                    child: const SizedBox.expand(),
                  ),
                ),

                // Titik tujuan
                Positioned(
                  top: 120,
                  right: 80,
                  child: _MapMarker(
                    icon: Icons.location_on_rounded,
                    color: AppTheme.bahaya,
                    label: 'Tujuan',
                  ),
                ),

                // Posisi driver
                Positioned(
                  bottom: 140,
                  left: 80,
                  child: _MapMarker(
                    icon: Icons.delivery_dining_rounded,
                    color: color,
                    label: 'Posisi Anda',
                  ),
                ),

                // Overlay info jarak
                Positioned(
                  top: AppTheme.sM,
                  left: AppTheme.sM,
                  right: AppTheme.sM,
                  child: Container(
                    padding: const EdgeInsets.all(AppTheme.sM),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.7),
                      borderRadius:
                          BorderRadius.circular(AppTheme.rM),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.navigation_rounded,
                            color: color, size: 20),
                        const SizedBox(width: AppTheme.sS),
                        Expanded(
                          child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                              Text(
                                order.pasienAlamat,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (order.jarakKm != null)
                                Text(
                                  '${order.jarakKm!.toStringAsFixed(1)} km · ~${order.estimasiMenit?.toInt() ?? '?'} menit',
                                  style: TextStyle(
                                      color: Colors.white
                                          .withOpacity(0.7),
                                      fontSize: 11),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Panel Bawah ───────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(AppTheme.sM),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            order.pasienNama,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
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

                const SizedBox(height: AppTheme.sM),

                // Tombol konfirmasi pengiriman
                if (order.status == StatusOrder.diantar)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        ref
                            .read(driverOrderProvider.notifier)
                            .updateStatusOrder(
                                order.id, StatusOrder.selesai);
                        context.pop();
                      },
                      icon: const Icon(Icons.check_rounded, size: 18),
                      label: const Text('Konfirmasi Terkirim'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.sukses,
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => context.pop(),
                      icon: const Icon(Icons.arrow_back_rounded,
                          size: 18),
                      label: const Text('Kembali'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MapMarker extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;

  const _MapMarker(
      {required this.icon, required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                  color: color.withOpacity(0.5),
                  blurRadius: 12,
                  spreadRadius: 2)
            ],
          ),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.6),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(label,
              style: const TextStyle(color: Colors.white, fontSize: 10)),
        ),
      ],
    );
  }
}

class _MapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = const Color(0xFF243447)
      ..strokeWidth = 1;

    // Grid jalan simulasi
    for (double x = 0; x < size.width; x += 60) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += 60) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // Jalan utama
    final roadPaint = Paint()
      ..color = const Color(0xFF2D4159)
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(
        const Offset(0, 160), Offset(size.width, 160), roadPaint);
    canvas.drawLine(Offset(size.width * 0.4, 0),
        Offset(size.width * 0.4, size.height), roadPaint);

    // Rute driver (garis putus-putus oranye)
    final routePaint = Paint()
      ..color = const Color(0xFFE65100)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;

    final path = Path()
      ..moveTo(80, size.height - 120)
      ..lineTo(size.width * 0.4, size.height - 120)
      ..lineTo(size.width * 0.4, 160)
      ..lineTo(size.width - 80, 160)
      ..lineTo(size.width - 80, 100);

    canvas.drawPath(path, routePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
