"use client"
import React, { useEffect, useState } from 'react'

const useUserType = () => {
    const [userType, setUserType] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchUserType = async () => {
          try {
            const response = await fetch('/api/auth/session');
            const data = await response.json();
    
            if (data.authenticated) {
              setUserType(data.tipo);
            }
          } catch (error) {
            console.error('Error al obtener el tipo de usuario:', error);
          } finally {
            setIsLoading(false);
          }
        };
    
        fetchUserType();
      }, []);
  return  { userType, isLoading };
  
}

export default useUserType