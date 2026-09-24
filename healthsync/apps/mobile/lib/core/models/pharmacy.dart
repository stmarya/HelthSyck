import 'package:freezed_annotation/freezed_annotation.dart';

part 'pharmacy.freezed.dart';
part 'pharmacy.g.dart';

// ─────────────────────────────────────────────
// Model Resep Masuk untuk Apotek
// ─────────────────────────────────────────────

@freezed
class ResepMasuk with _$ResepMasuk {
  const factory ResepMasuk({
    required String id,
    required String pasienNama,
    required String dokterNama,
    required List<ItemResep> items,
    required String status,
    required DateTime createdAt,
    String? catatanDokter,
    String? nomorResep,
    DateTime? tanggalAmbil,
  }) = _ResepMasuk;

  factory ResepMasuk.fromJson(Map<String, dynamic> json) =>
      _$ResepMasukFromJson(json);
}

@freezed
class ItemResep with _$ItemResep {
  const factory ItemResep({
    required String namaObat,
    required int jumlah,
    required String satuan,
    required String aturanPakai,
    String? kodeObat,
    double? harga,
  }) = _ItemResep;

  factory ItemResep.fromJson(Map<String, dynamic> json) =>
      _$ItemResepFromJson(json);
}

// ─────────────────────────────────────────────
// Model Inventori Obat
// ─────────────────────────────────────────────

@freezed
class Obat with _$Obat {
  const factory Obat({
    required String id,
    required String nama,
    required String kategori,
    required int stok,
    required String satuan,
    required double harga,
    String? kode,
    String? deskripsi,
    DateTime? kadaluarsa,
    int? stokMinimum,
  }) = _Obat;

  factory Obat.fromJson(Map<String, dynamic> json) => _$ObatFromJson(json);
}

// ─────────────────────────────────────────────
// Status konstanta
// ─────────────────────────────────────────────

class StatusResep {
  static const String menunggu   = 'PENDING';
  static const String diproses   = 'PROCESSING';
  static const String siap       = 'READY';
  static const String selesai    = 'COMPLETED';
  static const String dibatalkan = 'CANCELLED';
}
