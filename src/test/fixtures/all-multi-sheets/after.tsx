import { View, StyleSheet } from 'react-native';

export const A = () => <View style={[aStyles.base, aStyles.container]} />;

export const B = () => <View style={[bStyles.base, bStyles.container]} />;

const aStyles = StyleSheet.create({
  base: { flex: 1 },
  container: {
    margin: 4,
  },
});

const bStyles = StyleSheet.create({
  base: { flex: 2 },
  container: {
    padding: 2,
  },
});
