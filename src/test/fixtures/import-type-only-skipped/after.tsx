import type { ViewStyle } from 'react-native';
import { View, StyleSheet } from 'react-native';

export const A = ({ s }: { s?: ViewStyle }) => <View style={styles.box} />;

const styles = StyleSheet.create({
  box: {
    margin: 4,
  },
});
