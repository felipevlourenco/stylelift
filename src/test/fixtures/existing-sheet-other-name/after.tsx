import { View, StyleSheet } from 'react-native';

export const A = () => <View style={s.box} />;

export const s = StyleSheet.create({
  container: { flex: 1 },
  box: {
    margin: 4,
  },
});
