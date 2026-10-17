import { View, Text, StyleSheet } from 'react-native';

export const A = () => (
  <View>
    <Text
      style={styles.label}
    />
  </View>
);

const styles = StyleSheet.create({
  label: {
    transform: [
      { scale: 2 },
    ],
    margin: 4,
  },
});
