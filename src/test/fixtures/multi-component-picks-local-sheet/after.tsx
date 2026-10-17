import { View, StyleSheet } from 'react-native';

export const Header = () => <View style={headerStyles.box} />;

export const Body = () => <View style={[bodyStyles.base, bodyStyles.row]} />;

const headerStyles = StyleSheet.create({
  box: { flex: 1 },
});

const bodyStyles = StyleSheet.create({
  base: { flex: 2 },
  row: {
    margin: 4,
  },
});
