import { View, StyleSheet } from 'react-native';

export function A() {
	return (
		<View style={{ <|box>margin: 4 }} />
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
});
