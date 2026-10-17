import { View, StyleSheet } from 'react-native';

export const A = () => <View style={{ <|box>color: 'blue', padding: 2 }} />;

const styles = StyleSheet.create({
  box: {
    margin: 4,
    color: 'red',
  },
});
