import { View, StyleSheet } from 'react-native';

export function A() {
  return (
    <View>
      <View style={styles.<|>box} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    transform: [
      { scale: 2 },
    ],
    margin: 4,
  },
});
