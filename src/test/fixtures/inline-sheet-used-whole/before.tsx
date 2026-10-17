import { View, StyleSheet } from 'react-native';

const { other } = styles;

export const A = () => <View style={styles.<|>box} />;

const styles = StyleSheet.create({
  box: {
    margin: 4,
  },
  other: {},
});
