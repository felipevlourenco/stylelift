import { View } from 'react-native';

export const Box = ({ size }: { size: number }) => (
  <View style={{ width: size, <|box>padding: 8 }} />
);
