import { View, Text } from 'react-native';

export const Card = ({ n }) => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: 9 }}>{n}</Text>
  </View>
);
