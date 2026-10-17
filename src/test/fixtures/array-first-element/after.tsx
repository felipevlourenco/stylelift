import { View, StyleSheet } from 'react-native';

export const A = ({ extra }) => <View style={[styles.b, extra]} />;

const styles = StyleSheet.create({
  a: { flex: 1 },
  b: {
    margin: 4,
  },
});
