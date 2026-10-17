import { View, StyleSheet } from 'react-native';

export const Box = ({ size }: { size: number }) => (
  <View style={[styles.box, { width: size }]} />
);

const styles = StyleSheet.create({
  box: {
    padding: 8,
  },
});
