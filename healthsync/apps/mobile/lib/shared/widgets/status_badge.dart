import 'package:flutter/material.dart';
import '../../core/app_theme.dart';

/// StatusBadge — Label status berwarna (pill/chip)
class StatusBadge extends StatelessWidget {
  final String label;
  final StatusTipe tipe;

  const StatusBadge({
    super.key,
    required this.label,
    this.tipe = StatusTipe.info,
  });

  /// Buat dari string status secara otomatis
  factory StatusBadge.auto(String status) {
    final tipe = _tipeFromStatus(status);
    return StatusBadge(label: _labelDari(status), tipe: tipe);
  }

  static StatusTipe _tipeFromStatus(String s) {
    final lower = s.toLowerCase();
    if (lower.contains('selesai') || lower.contains('completed') ||
        lower.contains('delivered') || lower.contains('ready') || lower.contains('sukses')) {
      return StatusTipe.sukses;
    }
    if (lower.contains('darurat') || lower.contains('emergency') ||
        lower.contains('critical') || lower.contains('batal') || lower.contains('cancel')) {
      return StatusTipe.bahaya;
    }
    if (lower.contains('proses') || lower.contains('processing') ||
        lower.contains('transport') || lower.contains('antar') || lower.contains('route')) {
      return StatusTipe.peringatan;
    }
    return StatusTipe.info;
  }

  static String _labelDari(String s) {
    final map = <String, String>{
      'PENDING':             'Menunggu',
      'PROCESSING':          'Diproses',
      'ISSUED':              'Diterbitkan',
      'SENT_TO_PHARMACY':    'Dikirim ke Apotek',
      'CONFIRMED':           'Dikonfirmasi',
      'PREPARING':           'Disiapkan',
      'DELIVERING':          'Sedang Diantar',
      'READY':               'Siap Ambil',
      'COMPLETED':           'Selesai',
      'CANCELLED':           'Dibatalkan',
      'WAITING':             'Menunggu',
      'ACCEPTED':            'Diterima',
      'ON_THE_WAY_PICKUP':   'Menuju Apotek',
      'PICKED_UP':           'Obat Diambil',
      'ON_THE_WAY_DELIVER':  'Sedang Diantar',
      'DELIVERED':           'Terkirim',
      'STANDBY':             'Siaga',
      'EN_ROUTE_TO_PATIENT': 'Menuju Pasien',
      'ARRIVED_AT_PATIENT':  'Tiba di Pasien',
      'TRANSPORTING':        'Mengangkut',
      'EMERGENCY':           'DARURAT',
      'CRITICAL':            'KRITIS',
      'NORMAL':              'Normal',
    };
    return map[s.toUpperCase()] ?? s;
  }

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color fg;
    switch (tipe) {
      case StatusTipe.sukses:
        bg = AppTheme.sukses.withOpacity(0.12);
        fg = AppTheme.sukses;
        break;
      case StatusTipe.bahaya:
        bg = AppTheme.bahaya.withOpacity(0.12);
        fg = AppTheme.bahaya;
        break;
      case StatusTipe.peringatan:
        bg = AppTheme.peringatan.withOpacity(0.15);
        fg = AppTheme.peringatan;
        break;
      case StatusTipe.info:
      default:
        bg = AppTheme.info.withOpacity(0.12);
        fg = AppTheme.info;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: fg,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

enum StatusTipe { sukses, bahaya, peringatan, info }
