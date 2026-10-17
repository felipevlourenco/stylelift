import { View, Text } from 'react-native';

export const A = ({ size }: { size: number }) => (
  <View style={{ flex: 1, padding: 8 }}>
    <Text style={{ fontSize: 20 }}>hi</Text>
    <View style={{ margin: 4 }} />
    <View style={{ margin: 4 }} />
    <View style={[{ opacity: 0.5 }, { height: size, top: 1 }]} />
    <View style={{ width: size }} />
  </View>
);
