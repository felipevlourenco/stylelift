import { View, StyleSheet } from 'react-native';

export const A = ({ rest }) => <View style={[styles.box, { ...rest, padding: 8 }]} />;

const styles = StyleSheet.create({
  box: {
    margin: 1,
  },
});
