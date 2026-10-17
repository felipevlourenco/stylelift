import { View, StyleSheet } from 'react-native';

export function A() {
  return (
    <View>
      <View style={{
        transform: [
          { scale: 2 },
        ],
        margin: 4,
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
});
