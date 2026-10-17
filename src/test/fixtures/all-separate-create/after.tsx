import { View, Text } from 'react-native';
import { styles } from './Card.styles';

export const Card = ({ n }) => (
  <View style={styles.container}>
    <Text style={styles.text}>{n}</Text>
  </View>
);
