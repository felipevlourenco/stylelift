import { View } from 'react-native';

export const A = ({ size, on, theme, rest }) => (
  <View style={{ <|box>margin: -4, position: 'absolute' as const, transform: [{ scale: 2 }], shadowOffset: { width: 0, height: 1 }, content: `x`, width: size, color: theme.color, opacity: on ? 1 : 0, border: { width: size }, size }} />
);
