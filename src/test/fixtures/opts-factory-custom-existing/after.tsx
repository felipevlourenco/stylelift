import { View } from 'react-native';
import { createStyles } from './theme';

export const A = () => <View style={styles.box} />;

const styles = createStyles({
  container: { flex: 1 },
  box: {
    margin: 4,
  },
});
