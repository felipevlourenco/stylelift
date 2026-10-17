import { View, StyleSheet } from 'react-native';

export const A = () => (
  <>
    <View style={{ margin: 4 }} />
    <View style={styles.box} />
  </>
);

const styles = StyleSheet.create({
  box: {
    margin: 4,
  },
});
