import { View, Text } from 'react-native';

export function Label(props) {
  return (
    <View style={{ <|wrap>padding: 4 }}>
      <Text>{props.children}</Text>
    </View>
  );
}
