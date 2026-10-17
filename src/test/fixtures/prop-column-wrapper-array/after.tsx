import { FlatList, StyleSheet } from 'react-native';

export const A = ({ gap }) => <FlatList columnWrapperStyle={[styles.columnWrapper, { gap }]} />;

const styles = StyleSheet.create({
  list: { flex: 1 },
  columnWrapper: {
    justifyContent: 'space-between',
  },
});
