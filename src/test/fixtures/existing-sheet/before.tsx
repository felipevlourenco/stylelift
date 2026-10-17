import { View, Text, StyleSheet } from 'react-native';

export function A() {
  return (
    <View style={styles.container}>
      <Text style={{ <|label>color: 'red', fontSize: 12 }}>x</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
