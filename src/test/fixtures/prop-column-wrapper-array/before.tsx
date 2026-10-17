import { FlatList, StyleSheet } from 'react-native';

export const A = ({ gap }) => <FlatList columnWrapperStyle={[{ <|>justifyContent: 'space-between', gap }]} />;

const styles = StyleSheet.create({
  list: { flex: 1 },
});
