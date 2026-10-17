import { View, StyleSheet } from 'react-native';

export const A = ({ extra }) => <View style={[styles.a, { margin: 4 }, extra]} />;

const styles = StyleSheet.create({
  a: { flex: 1 },
});
