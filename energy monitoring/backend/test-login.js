const axios = require('axios');
const bcrypt = require('bcryptjs');

const testLogin = async () => {
  try {
    console.log('Testing admin login...\n');
    
    // Test the login API
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@energyai.com',
      password: 'admin123'
    });
    
    console.log('✅ Login Successful!');
    console.log('\nResponse:', JSON.stringify(response.data, null, 2));
    console.log('\nToken:', response.data.token);
    console.log('\nUse this in browser console:');
    console.log(`sessionStorage.setItem('energyai_token', '${response.data.token}')`);
    console.log(`sessionStorage.setItem('energyai_user', '${JSON.stringify(response.data.user)}')`);
    
  } catch (error) {
    console.error('❌ Login Failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
};

testLogin();
