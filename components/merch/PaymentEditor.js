import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { Button } from '../ui/Button';
import { PAYMENT } from './catalog';
import { fetchMerchPayment, upsertMerchPayment } from '../../lib/merch/merchRepository';

const METHODS = ['CCP', 'EcoCash'];

// Build the per-method value maps, DB values overriding the catalog placeholders.
function initFrom(db) {
  const out = {};
  for (const method of METHODS) {
    const values = {};
    PAYMENT[method].lines.forEach(([k, v]) => { values[k] = v; }); // catalog defaults
    (db?.[method]?.lines ?? []).forEach(([k, v]) => { values[k] = v; }); // DB override
    out[method] = values;
  }
  return out;
}

// Admin editor for the CCP / EcoCash destinations shown at checkout. Writes go through
// the admin-gated upsert_merch_payment RPC; the storefront reads them live (with the
// catalog.js defaults as fallback). Line KEYS are fixed from the catalog; only the values
// + the buyer note are editable, which keeps the form simple and on-shape.
export function PaymentEditor() {
  const qc = useQueryClient();
  const [vals, setVals] = useState(() => initFrom({}));
  const [notes, setNotes] = useState({ CCP: PAYMENT.CCP.note, EcoCash: PAYMENT.EcoCash.note });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchMerchPayment().then((db) => {
      if (!alive) return;
      setVals(initFrom(db));
      setNotes({
        CCP: db?.CCP?.note ?? PAYMENT.CCP.note,
        EcoCash: db?.EcoCash?.note ?? PAYMENT.EcoCash.note,
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const setVal = (method, key) => (v) => setVals((s) => ({ ...s, [method]: { ...s[method], [key]: v } }));
  const setNote = (method) => (v) => setNotes((n) => ({ ...n, [method]: v }));

  const save = async () => {
    setErr(null); setMsg(null); setSaving(true);
    try {
      for (const method of METHODS) {
        const keys = PAYMENT[method].lines.map(([k]) => k);
        const lines = keys.map((k) => [k, (vals[method][k] ?? '').trim()]).filter(([, v]) => v);
        await upsertMerchPayment(method, lines, notes[method]);
      }
      qc.invalidateQueries({ queryKey: ['merch', 'payment'] });
      setMsg('Payment details saved — live at checkout now.');
    } catch (e) {
      setErr(e?.message === 'NOT_ADMIN' ? 'You are not an admin.' : `Could not save: ${e?.message || 'unknown error'} — is the merch migration applied?`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      {METHODS.map((method) => (
        <View key={method} style={styles.block}>
          <AppText variant="bodySemi" style={styles.method}>{PAYMENT[method].label}</AppText>
          {PAYMENT[method].lines.map(([key]) => (
            <View key={key} style={styles.field}>
              <AppText variant="label" color={colors.textLo}>{key}</AppText>
              <TextInput
                style={styles.input}
                value={vals[method][key] ?? ''}
                onChangeText={setVal(method, key)}
                placeholder={`${key}…`}
                placeholderTextColor={colors.textMute}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}
          <View style={styles.field}>
            <AppText variant="label" color={colors.textLo}>Note to buyer</AppText>
            <TextInput
              style={[styles.input, styles.multi]}
              value={notes[method] ?? ''}
              onChangeText={setNote(method)}
              placeholder="Short instruction shown under the details…"
              placeholderTextColor={colors.textMute}
              multiline
            />
          </View>
        </View>
      ))}

      {err ? <AppText variant="body" color={colors.danger} style={styles.msg}>{err}</AppText> : null}
      {msg ? <AppText variant="body" color={colors.accent} style={styles.msg}>{msg}</AppText> : null}
      <Button label="Save payment details" onPress={save} loading={saving} style={styles.saveBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md, gap: space.sm },
  method: { marginBottom: 2 },
  field: { gap: 6 },
  input: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.textHi, fontFamily: fonts.body, fontSize: 15 },
  multi: { minHeight: 54, textAlignVertical: 'top' },
  msg: { marginTop: space.xs },
  saveBtn: { marginTop: space.sm },
});
