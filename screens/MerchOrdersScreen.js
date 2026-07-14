import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { OrderDetailSheet } from '../components/merch/OrderDetailSheet';
import { ORDER_STATUS_LABEL, orderStatusColor, formatOrderDate } from '../components/merch/orderMeta';
import { fetchMerchOrders } from '../lib/merch/merchRepository';

const FILTERS = [['all', 'All'], ['new', 'New'], ['paid', 'Paid'], ['shipped', 'Shipped'], ['cancelled', 'Cancelled']];

// Admin: customer orders placed at checkout. Read/update/delete are RLS-gated to admins.
export default function MerchOrdersScreen({ navigation }) {
  const [filter, setFilter] = useState('all');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOrders(await fetchMerchOrders(filter)); }
    catch { setError('Could not load orders. Is the merch_orders migration applied?'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading">Orders</AppText>
        <TouchableOpacity onPress={load} hitSlop={10}>
          <AppText variant="label" color={colors.accent2}>Refresh</AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setFilter(key)} style={[styles.filterChip, filter === key && styles.filterChipOn]}>
              <AppText variant="label" color={filter === key ? colors.onAccent : colors.textLo}>{label}</AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
        ) : error ? (
          <AppText variant="body" color={colors.danger} style={styles.empty}>{error}</AppText>
        ) : orders.length === 0 ? (
          <AppText variant="body" color={colors.textLo} style={styles.empty}>
            {filter === 'all' ? 'No orders yet. They land here the moment a customer confirms checkout.' : `No ${filter} orders.`}
          </AppText>
        ) : (
          orders.map((o) => (
            <TouchableOpacity key={o.id} style={styles.card} onPress={() => setSelected(o)} activeOpacity={0.7}>
              {o.imageUrl
                ? <Image source={{ uri: o.imageUrl }} style={styles.thumb} />
                : <View style={[styles.thumb, styles.thumbFallback]}><AppText style={styles.thumbGlyph}>{o.kind === 'tip' ? '🙏' : '👕'}</AppText></View>}
              <View style={{ flex: 1 }}>
                <View style={styles.cardTop}>
                  <AppText variant="bodySemi" numberOfLines={1} style={{ flex: 1 }}>{o.itemName}</AppText>
                  <View style={[styles.statusPill, { backgroundColor: orderStatusColor(o.status) }]}>
                    <AppText style={styles.statusPillText}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</AppText>
                  </View>
                </View>
                <AppText variant="label" color={colors.textLo} numberOfLines={1}>
                  {[o.size ? `Size ${o.size}` : null, o.amountLabel, o.name].filter(Boolean).join(' · ')}
                </AppText>
                <AppText variant="caption" color={colors.textMute} numberOfLines={1} style={styles.cardMeta}>
                  {[o.phone, formatOrderDate(o.createdAt)].filter(Boolean).join('  ·  ')}
                </AppText>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textMute} />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: space.huge }} />
      </ScrollView>

      <OrderDetailSheet order={selected} onClose={() => setSelected(null)} onChanged={load} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.sm },

  filterWrap: { height: 44 },
  filterRow: { paddingHorizontal: space.base, gap: space.sm, alignItems: 'center' },
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated },
  filterChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },

  list: { paddingHorizontal: space.base, paddingTop: space.sm },
  empty: { textAlign: 'center', marginTop: space.xxl, lineHeight: 22, paddingHorizontal: space.lg },

  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.sm, marginBottom: space.sm },
  thumb: { width: 52, height: 62, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { fontSize: 24 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardMeta: { marginTop: 3 },
  statusPill: { borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 8 },
  statusPillText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6, color: colors.onAccent },
});
