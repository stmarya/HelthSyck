import 'package:freezed_annotation/freezed_annotation.dart';

part 'driver_order.freezed.dart';
part 'driver_order.g.dart';

// ─────────────────────────────────────────────
// Model Order Pengiriman untuk Driver Apotek
// ─────────────────────────────────────────────

@freezed
class DriverOrder with _$DriverOrder {
  const factory DriverOrder({
    required String id,
    required String pasienNama,
    required String pasienAlamat,
    required String apotek,
    required String status,
    required List<String> items,
    required DateTime createdAt,
    double? jarakKm,
    double? estimasiMenit,
    String? catatanAlamat,
    double? latTujuan,
    double? lngTujuan,
    double? latApotek,
    double? lngApotek,
    DateTime? waktuDiambil,
    DateTime? waktuTiba,
    double? ongkir,
  }) = _DriverOrder;

  factory DriverOrder.fromJson(Map<String, dynamic> json) =>
      _$DriverOrderFromJson(json);
}

// ─────────────────────────────────────────────
// Status Order Driver
// ─────────────────────────────────────────────

class StatusOrder {
  static const String menunggu    = 'WAITING';
  static const String diterima    = 'ACCEPTED';
  static const String menuju      = 'ON_THE_WAY_PICKUP';
  static const String diambil     = 'PICKED_UP';
  static const String diantar     = 'ON_THE_WAY_DELIVER';
  static const String selesai     = 'DELIVERED';
  static const String dibatalkan  = 'CANCELLED';
}
