import { Text, StyleSheet } from 'react-native';

const Title = () => <Text style={styles.title}>Hi</Text>;

export default Title;

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});
