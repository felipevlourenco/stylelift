import { View, StyleSheet } from 'react-native';

export const A = () => <View style={[aStyles.base, { margin: 4 }]} />;

export const B = () => <View style={[bStyles.base, { padding: 2 }]} />;

const aStyles = StyleSheet.create({
  base: { flex: 1 },
});

const bStyles = StyleSheet.create({
  base: { flex: 2 },
});
