import { View, Text, StyleSheet } from 'react-native';

export function Label(props) {
  return (
    <View style={styles.wrap}>
      <Text>{props.children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 4,
  },
});
