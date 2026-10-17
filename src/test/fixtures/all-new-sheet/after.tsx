import { View, Text, StyleSheet } from 'react-native';

export const A = ({ size }: { size: number }) => (
  <View style={styles.container}>
    <Text style={styles.text}>hi</Text>
    <View style={styles.container2} />
    <View style={styles.container2} />
    <View style={[styles.container3, styles.container4, { height: size }]} />
    <View style={{ width: size }} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
  },
  text: {
    fontSize: 20,
  },
  container2: {
    margin: 4,
  },
  container3: {
    opacity: 0.5,
  },
  container4: {
    top: 1,
  },
});
